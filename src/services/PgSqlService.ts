import {
    AppConfigService,
    DockerService,
    FileSystem,
    Injectable,
    PluginConfigService,
    ProxyService,
    LogService
} from "@wocker/core";
import {promptInput, promptConfirm, promptSelect} from "@wocker/utils";
import {drizzle} from "drizzle-orm/node-postgres";
import {drizzle as drizzleProxy} from "drizzle-orm/pg-proxy";
import CliTable from "cli-table3";
import CSVParser from "csv-parser";
import {Writable} from "stream";
import {format as dateFormat} from "date-fns/format";
import {Config, AdminConfig} from "../makes/Config";
import {Service, ServiceProps, ServiceStorage, STORAGE_FILESYSTEM, STORAGE_VOLUME} from "../makes/Service";
import {PgDatabaseTable} from "../table/PgDatabaseTable";


@Injectable()
export class PgSqlService {
    protected adminContainerName = "dbadmin-pgsql.workspace";
    protected _config?: Config;

    public constructor(
        protected readonly appConfigService: AppConfigService,
        protected readonly pluginConfigService: PluginConfigService,
        protected readonly dockerService: DockerService,
        protected readonly proxyService: ProxyService,
        protected readonly logService: LogService
    ) {}

    public get config(): Config {
        if(!this._config) {
            this._config = Config.make(this.fs);
        }

        return this._config;
    }

    public get services(): Service[] {
        return this.config.services;
    }

    public get fs(): FileSystem {
        let fs = this.pluginConfigService.fs;

        if(!fs) {
            fs = new FileSystem(this.pluginConfigService.dataPath());
        }

        return fs;
    }

    public get dbFs(): FileSystem {
        return new FileSystem(this.appConfigService.dataPath("db/pgsql"));
    }

    public async query<T = unknown>(service: Service, query: string, headers?: boolean): Promise<T[]> {
        if(service.isExternal) {
            throw new Error("Unsupported for external service");
        }

        const container = await this.dockerService.getContainer(service.containerName);

        if(!container) {
            throw new Error("Service is not running");
        }

        const exec = await container.exec({
            Cmd: ["psql", ...service.auth, "--csv", "-c", query],
            Env: [
                `PGPASSWORD=${service.password}`
            ],
            AttachStdout: true,
            AttachStderr: true
        });

        const stream = await exec.start({
            hijack: true,
            Tty: true
        });

        return new Promise<T[]>((resolve, reject): void => {
            const results: T[] = [];

            stream
                .pipe(CSVParser({
                    headers
                }))
                .on("data", (data: T) => {
                    results.push(data);
                })
                .on("end", () => {
                    resolve(results);
                })
                .on("error", reject);
        });
    }

    public getServiceDatabase(service: Service) {
        if(service.isExternal && service.host) {
            const url = `postgresql://${service.user}:${service.password}@${service.host}:${service.port}`;

            this.logService.info(url);

            return drizzle(url);
        }

        return drizzleProxy(async (sql, params, method) => {
            this.logService.debug("pgsql query", {
                sql,
                params,
                method
            });

            return {
                rows: await this.query<any>(service, sql, false)
            };
        });
    }

    public async getTables(service: Service) {
        return this.getServiceDatabase(service)
            .select({
                table: PgDatabaseTable.datname
            })
            .from(PgDatabaseTable)
            .execute();
    }

    public dbPath(service: string): string {
        return this.appConfigService.dataPath("db/pgsql", service);
    }

    public async init(admin: Partial<AdminConfig>): Promise<void> {
        if(typeof admin.enabled === "undefined") {
            admin.enabled = await promptConfirm({
                message: "Enable admin?"
            });
        }
        else {
            this.config.admin.enabled = admin.enabled;
        }

        if(this.config.admin.enabled) {
            if(!admin.email) {
                this.config.admin.email = await promptInput({
                    message: "Email",
                    type: "text",
                    default: this.config.admin.email || "root@pgsql.ws"
                });
            }
            else {
                this.config.admin.email = admin.email;
            }

            if(!admin.password) {
                this.config.admin.password = await promptInput({
                    message: "Password",
                    type: "text",
                    default: this.config.admin.password || "toor"
                });
            }
            else {
                this.config.admin.password = admin.password;
            }

            if(typeof admin.skipPassword === "undefined") {
                this.config.admin.skipPassword = await promptConfirm({
                    message: "Skip password",
                    default: this.config.admin.skipPassword
                });
            }
            else {
                this.config.admin.skipPassword = admin.skipPassword;
            }
        }

        this.config.save();
    }

    public async create(serviceProps: Partial<ServiceProps> = {}): Promise<void> {
        if(!serviceProps.name || this.config.hasService(serviceProps.name)) {
            serviceProps.name = await promptInput({
                message: "Service name",
                default: serviceProps.name || "default",
                validate: (name?: string) => {
                    if(!name) {
                        return "Service name is required";
                    }

                    if(this.config.hasService(name)) {
                        return `Service "${name}" is already exists`;
                    }

                    return true;
                }
            });
        }

        if(!serviceProps.user) {
            serviceProps.user = await promptInput({
                message: "Database user",
                type: "text",
                required: true,
                default: "root"
            });
        }

        while(!serviceProps.password) {
            serviceProps.password = await promptInput({
                type: "password",
                required: true,
                message: "Database password",
                minLength: 4
            });

            const confirmPassword = await promptInput({
                type: "password",
                required: true,
                message: "Confirm password"
            });

            if(serviceProps.password !== confirmPassword) {
                console.error("Passwords do not match");
                delete serviceProps.password;
            }
        }

        if(!serviceProps.host) {
            if(!serviceProps.storage || ![STORAGE_VOLUME, STORAGE_FILESYSTEM].includes(serviceProps.storage)) {
                serviceProps.storage = await promptSelect<ServiceStorage>({
                    message: "Storage:",
                    options: [STORAGE_VOLUME, STORAGE_FILESYSTEM]
                });
            }

            if(!serviceProps.containerPort) {
                const needPort = await promptConfirm({
                    message: "Do you need to expose container port?",
                    default: false
                });

                if(needPort) {
                    serviceProps.containerPort = await promptInput({
                        required: true,
                        message: "Container port:",
                        type: "number",
                        min: 1,
                        default: 5432
                    });
                }
            }
        }

        this.config.setService(new Service(serviceProps as ServiceProps));
        this.config.save();
    }

    public async upgrade(serviceProps: Partial<ServiceProps>): Promise<void> {
        const service = this.config.getServiceOrDefault(serviceProps.name);
        let changed = false;

        if(serviceProps.imageName) {
            service.imageName = serviceProps.imageName;
            changed = true;
        }

        if(serviceProps.imageVersion) {
            service.imageVersion = serviceProps.imageVersion;
            changed = true;
        }

        if(serviceProps.containerPort) {
            service.containerPort = serviceProps.containerPort;
            changed = true;
        }

        if(changed) {
            this.config.setService(service);
            this.config.save();
        }
    }

    public async destroy(name: string, yes?: boolean, force?: boolean): Promise<void> {
        const service = this.config.getServiceOrDefault(name);

        if(!force && service.name === this.config.default) {
            throw new Error(`Can't delete default service.`);
        }

        if(!yes) {
            const confirm = await promptConfirm({
                message: `Are you sure you want to delete "${service.name}" service?`,
                default: false
            });

            if(!confirm) {
                throw new Error("Aborted");
            }
        }

        if(!service.host) {
            await this.dockerService.removeContainer(service.containerName);

            switch(service.storage) {
                case STORAGE_VOLUME:
                    if(service.volume !== service.defaultVolume) {
                        console.info(`Deletion of custom volume "${service.volume}" skipped.`);
                        break;
                    }

                    if(!this.pluginConfigService.isVersionGTE("1.0.19")) {
                        throw new Error("Please update wocker for using volume storage");
                    }

                    if(await this.dockerService.hasVolume(service.volume)) {
                        await this.dockerService.rmVolume(service.volume);
                    }
                    break;

                case STORAGE_FILESYSTEM:
                    this.dbFs.rm(service.name, {
                        recursive: true,
                        force: true
                    });
                    break;

                default:
                    throw new Error(`Unknown storage type "${service.storage}"`);
            }
        }

        this.config.unsetService(service.name);
        this.config.save();
    }

    public async listTable(): Promise<string> {
        const table = new CliTable({
            head: ["Name", "Image", "Host/Container", "Expose port", "Volume"]
        });

        for(const service of this.config.services) {
            table.push([
                service.name + (this.config.default === service.name ? " (default)" : ""),
                service.image,
                service.host || service.containerName,
                service.containerPort,
                service.storage === "volume" ? service.volume : undefined
            ]);
        }

        return table.toString();
    }

    public async start(name?: string, restart?: boolean): Promise<void> {
        if(!name && !this.config.default) {
            await this.create();
        }

        const service = this.config.getServiceOrDefault(name);

        if(service.isExternal) {
            return;
        }

        if(restart) {
            await this.dockerService.removeContainer(service.containerName);
        }

        let container = await this.dockerService.getContainer(service.containerName);

        if(!container) {
            const {
                user = "root",
                password = "root"
            } = service;
            const volumes: string[] = [];

            switch(service.storage) {
                case STORAGE_VOLUME:
                    if(!this.pluginConfigService.isVersionGTE("1.0.19")) {
                        throw new Error("Please update wocker for using volume storage");
                    }

                    if(!await this.dockerService.hasVolume(service.volume)) {
                        await this.dockerService.createVolume(service.volume);
                    }

                    volumes.push(`${service.volume}:/var/lib/postgresql/data`);
                    break;

                case STORAGE_FILESYSTEM:
                    volumes.push(`${this.dbPath(service.name)}:/var/lib/postgresql/data`);
                    break;

                default:
                    throw new Error(`Unknown storage type "${service.storage}"`);
            }

            container = await this.dockerService.createContainer({
                name: service.containerName,
                image: service.image,
                restart: "always",
                volumes: volumes,
                env: {
                    POSTGRES_USER: user,
                    POSTGRES_PASSWORD: password
                },
                ports: service.containerPort
                    ? [`${service.containerPort}:5432`]
                    : undefined
            });
        }

        const {
            State: {
                Running
            }
        } = await container.inspect();

        if(!Running) {
            await container.start();
        }

        console.info(`Started ${service.name} at ${service.containerName}`);
    }

    public async stop(name?: string): Promise<void> {
        const service = this.config.getServiceOrDefault(name);

        await this.dockerService.removeContainer(service.containerName);
    }

    public async pgsql(name?: string): Promise<void> {
        const service = this.config.getServiceOrDefault(name);

        const container = await this.dockerService.getContainer(service.containerName);

        if(!container) {
            throw new Error(`Service "${service.name}" isn't started`);
        }

        await this.dockerService.exec(service.containerName, {
            tty: true,
            cmd: ["psql"]
        });
    }

    public async dump(name?: string, database?: string): Promise<void> {
        const service = this.config.getServiceOrDefault(name);

        const container = await this.dockerService.getContainer(service.containerName);

        if(!container) {
            throw new Error(`Service "${service.name}" isn't started`);
        }

        if(!database) {
            const res = await this.getTables(service);

            database = await promptSelect({
                required: true,
                options: res.map((r) => r.table)
            });
        }

        await this.dockerService.exec(service.containerName, {
            tty: true,
            cmd: ["pg_dump", ...service.auth, "-d", database]
        });
    }

    public async backup(name?: string, database?: string, filename?: string): Promise<void> {
        const service = this.config.getServiceOrDefault(name);

        if(!database) {
            const res = await this.getTables(service);

            database = await promptSelect({
                message: "Database",
                required: true,
                options: res.map((r) => r.table)
            });
        }

        if(!filename) {
            const date = dateFormat(new Date(), "yyyy-MM-dd HH-mm");

            filename = await promptInput({
                message: "File name",
                required: true,
                suffix: ".sql",
                default: date
            });

            filename += ".sql";
        }

        if(!this.fs.exists(`dump/${service.name}/${database}`)) {
            this.fs.mkdir(`dump/${service.name}/${database}`, {
                recursive: true
            });
        }

        const container = !service.isExternal
            ? await this.dockerService.getContainer(service.containerName)
            : await this.dockerService.createContainer({
                name: service.name,
                image: service.image,
                tty: true,
                cmd: ["bash"],
                networkMode: "host"
            });

        if(!container) {
            throw new Error(`Service "${service.name}" isn't started`);
        }

        try {
            if(service.isExternal) {
                await container.start();
            }

            const file = this.fs.createWriteStream(`dump/${service.name}/${database}/${filename}`);
            const exec = await container.exec({
                Cmd: ["pg_dump", ...service.auth, "--if-exists", "--no-comments", "-c", "-d", database],
                Env: [
                    `PGPASSWORD=${service.password}`
                ],
                AttachStdout: true,
                AttachStderr: true
            });
            const stream = await exec.start({
                hijack: true
            });

            await new Promise<void>((resolve, reject) => {
                container.modem.demuxStream(stream, file, process.stderr);

                stream
                    .on("finish", resolve)
                    .on("error", reject);
            });

            console.info("Backup created");
        }
        finally {
            if(service.isExternal) {
                await container.stop();
                await container.remove();
            }
        }
    }

    public async deleteBackup(name?: string, database?: string, filename?: string): Promise<void> {
        const service = this.config.getServiceOrDefault(name);

        if(!database) {
            database = await promptSelect({
                required: true,
                options: this.fs.readdir(`dump/${service.name}`)
            });
        }

        if(!filename) {
            filename = await promptSelect({
                required: true,
                options: this.fs.readdir(`dump/${service.name}/${database}`)
            });
        }

        this.fs.rm(`dump/${service.name}/${database}/${filename}`);
    }

    public async restore(name?: string, database?: string, filename?: string): Promise<void> {
        const service = this.config.getServiceOrDefault(name);

        if(!database) {
            database = await promptSelect({
                message: "Database",
                required: true,
                options: this.fs.readdir(`dump/${service.name}`)
            });
        }

        if(!filename) {
            filename = await promptSelect({
                message: "File name",
                required: true,
                options: this.fs.readdir(`dump/${service.name}/${database}`)
            });
        }

        const container = !service.isExternal
            ? await this.dockerService.getContainer(service.containerName)
            : await this.dockerService.createContainer({
                name: service.containerName,
                image: service.image,
                tty: true,
                cmd: ["bash"],
                networkMode: "host"
            });

        if(!container) {
            throw new Error(`Service "${service.name}" isn't started`);
        }

        try {
            if(service.isExternal) {
                await container.start();
            }

            const file = this.fs.createReadStream(`dump/${service.name}/${database}/${filename}`);
            const exec = await container.exec({
                Cmd: ["psql", "--set", "ON_ERROR_STOP=on", ...service.auth, "-d", database],
                Env: [
                    `PGPASSWORD=${service.password}`
                ],
                AttachStdin: true,
                AttachStdout: true,
                AttachStderr: true
            });

            const stream = await exec.start({
                stdin: true,
                hijack: true
            });

            await new Promise<void>((resolve, reject) => {
                container.modem.demuxStream(stream, new Writable({write: () => undefined}), process.stderr);

                file
                    .pipe(stream)
                    .on("error", reject);

                stream
                    .on("end", resolve)
                    .on("error", reject);
            });

            const info = await exec.inspect();

            if(info.ExitCode !== 0) {
                throw new Error(`Restore failed with exit code ${info.ExitCode}`);
            }

            console.info("Restored");
        }
        finally {
            if(service.isExternal) {
                await container.stop().catch(() => undefined);
                await container.remove().catch(() => undefined);
            }
        }
    }

    public async admin(): Promise<void> {
        const config = this.config;

        if(!config.admin.email || !config.admin.password) {
            console.info("Can't start admin credentials missed");
            return;
        }

        const servers = [];
        const passwords: any = {};

        for(const service of config.services || []) {
            let host;
            let port: number | string = 5432;

            if(service.host) {
                host = service.host;

                if(service.port) {
                    port = service.port;
                }
            }
            else {
                const container = await this.dockerService.getContainer(service.containerName);

                if(!container) {
                    continue;
                }

                const {
                    State: {
                        Running
                    }
                } = await container.inspect();

                if(!Running) {
                    continue;
                }

                host = service.containerName;
            }

            passwords[service.name] = `${host}:${port}:postgres:${service.user || ""}:${service.password || ""}`;

            servers.push({
                Group: "Servers",
                Name: service.name,
                Host: host,
                Port: 5432,
                MaintenanceDB: "postgres",
                Username: service.user,
                PassFile: `/var/lib/pgadmin/storage/passwords/${service.name}.pgpass`,
                SSLMode: "prefer"
            });
        }

        await this.dockerService.removeContainer(this.adminContainerName);

        if(!this.config.admin.enabled || servers.length === 0) {
            return;
        }

        this.fs.writeJSON("servers.json", {
            Servers: servers.reduce((res, server, index) => {
                return {
                    ...res,
                    [`${index}`]: server
                };
            }, {})
        });

        let container = await this.dockerService.getContainer(this.adminContainerName);

        if(!container) {
            container = await this.dockerService.createContainer({
                name: this.adminContainerName,
                image: "dpage/pgadmin4:latest",
                user: "root:root",
                restart: "always",
                entrypoint: [
                    "/bin/sh", "-c",
                    [
                        "mkdir -p /var/lib/pgadmin/storage/passwords",
                        ...Object.keys(passwords).map((name) => {
                            return `echo '${passwords[name]}' > /var/lib/pgadmin/storage/passwords/${name}.pgpass`;
                        }),
                        "chmod -R 600 /var/lib/pgadmin/storage/passwords/",
                        "chown -R root:root /var/lib/pgadmin/storage/passwords",
                        "/entrypoint.sh"
                    ].join(";") + ";"
                ],
                volumes: [
                    "wocker-pgadmin:/var/lib/pgadmin",
                    `${this.fs.path("servers.json")}:/pgadmin4/servers.json`
                ],
                env: {
                    VIRTUAL_HOST: this.adminContainerName,
                    PGADMIN_DEFAULT_EMAIL: config.admin.email || "",
                    PGADMIN_DEFAULT_PASSWORD: config.admin.password || "",
                    ...config.admin.skipPassword ? {
                        PGADMIN_CONFIG_SERVER_MODE: "False",
                        PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED: "False"
                    } : {}
                }
            });
        }

        const {
            State: {
                Running
            }
        } = await container.inspect();

        if(!Running) {
            await container.start();

            try {
                await this.proxyService.start();
            }
            catch(err) {
                //
            }
        }

        console.info(`Admin started at ${this.adminContainerName}`);

        if(!config.admin.skipPassword) {
            console.info(`Login: ${config.admin.email}`);
            console.info(`Password: ****`);
        }
        else {
            console.info("Password skipped");
        }
    }

    public async setDefault(name: string): Promise<void> {
        const config = this.config;

        if(!config.getService(name)) {
            throw new Error(`Service "${name}" not found`);
        }

        config.default = name;

        config.save();
    }

    public async getServices(): Promise<string[]> {
        return this.services.map((service) => {
            return service.name;
        });
    }
}
