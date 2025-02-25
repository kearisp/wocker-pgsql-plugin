import {AppConfigService, DockerService, FileSystem, Injectable, PluginConfigService, ProxyService} from "@wocker/core";
import {promptConfirm, promptSelect, promptText} from "@wocker/utils";
import CliTable from "cli-table3";

import {Config, ConfigProps} from "../makes/Config";
import {Service, ServiceProps, ServiceStorage, STORAGE_FILESYSTEM, STORAGE_VOLUME} from "../makes/Service";


@Injectable()
export class PgSqlService {
    protected adminContainerName = "dbadmin-pgsql.workspace";
    protected _config?: Config;

    public constructor(
        protected readonly appConfigService: AppConfigService,
        protected readonly pluginConfigService: PluginConfigService,
        protected readonly dockerService: DockerService,
        protected readonly proxyService: ProxyService
    ) {}

    public get config(): Config {
        if(!this._config) {
            const _this = this,
                fs = this.fs,
                data: ConfigProps = fs.exists("config.json")
                    ? fs.readJSON("config.json")
                    : {};

            this._config = new class extends Config {
                public save(): void {
                    if(!fs.exists("")) {
                        fs.mkdir("", {
                            recursive: true
                        });
                    }

                    fs.writeJSON(_this.configPath, this.toJSON());
                }
            }(data)
        }

        return this._config;
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

    public get configPath(): string {
        return "config.json";
    }

    public dbPath(service: string): string {
        return this.appConfigService.dataPath("db/pgsql", service);
    }

    public async init(email?: string, password?: string, skipPassword?: boolean): Promise<void> {
        const config = this.config;

        if(!email) {
            email = await promptText({
                type: "string",
                message: "Email",
                default: config.adminEmail || "root@pgsql.ws"
            });
        }

        if(!password) {
            password = await promptText({
                type: "string",
                message: "Password",
                default: config.adminPassword || "toor"
            });
        }

        if(typeof skipPassword === "undefined") {
            skipPassword = await promptConfirm({
                message: "Skip password",
                default: config.adminSkipPassword
            });
        }

        config.adminEmail = email;
        config.adminPassword = password;
        config.adminSkipPassword = skipPassword;

        config.save();
    }

    public async create(serviceProps: Partial<ServiceProps> = {}): Promise<void> {
        if(serviceProps.name && this.config.hasService(serviceProps.name)) {
            console.info(`Service "${serviceProps.name}" is already exists`);
            delete serviceProps.name;
        }

        if(!serviceProps.name) {
            serviceProps.name = await promptText({
                message: "Service name:",
                validate: (name?: string) => {
                    if(!name) {
                        return "Service name is required";
                    }

                    if(this.config.getService(name)) {
                        return `Service "${name}" is already exists`;
                    }

                    return true;
                }
            });
        }

        if(!serviceProps.user) {
            serviceProps.user = await promptText({
                message: "Database user:",
                type: "string",
                required: true,
                default: serviceProps.user
            });
        }

        if(!serviceProps.password) {
            serviceProps.password = await promptText({
                message: "Database password:",
                type: "password",
                required: true,
            });

            const confirmPassword = await promptText({
                message: "Confirm password:",
                type: "password",
                required: true
            });

            if(serviceProps.password !== confirmPassword) {
                throw new Error("Passwords do not match");
            }
        }

        if(!serviceProps.storage || ![STORAGE_VOLUME, STORAGE_FILESYSTEM].includes(serviceProps.storage)) {
            serviceProps.storage = await promptSelect<ServiceStorage>({
                message: "Storage:",
                options: [STORAGE_VOLUME, STORAGE_FILESYSTEM]
            });
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
            head: ["Name", "Host"]
        });

        for(const service of this.config.services) {
            table.push([
                service.name + (this.config.default === service.name ? " (default)" : ""),
                service.host || service.containerName
            ]);
        }

        return table.toString();
    }

    public async start(name?: string, restart?: boolean): Promise<void> {
        if(!name && !this.config.default) {
            await this.create();
        }

        const service = this.config.getServiceOrDefault(name);

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
                image: service.imageTag,
                restart: "always",
                volumes: volumes,
                env: {
                    POSTGRES_USER: user,
                    POSTGRES_PASSWORD: password
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

    public async dump(name?: string): Promise<void> {
        const service = this.config.getServiceOrDefault(name);
        const container = await this.dockerService.getContainer(service.containerName);

        if(!container) {
            throw new Error(`Service "${service.name}" isn't started`);
        }

        await this.dockerService.exec(service.containerName, {
            tty: true,
            cmd: ["pg_dump"]
        });
    }

    public async admin(): Promise<void> {
        const config = this.config;

        if(!config.adminEmail || !config.adminPassword) {
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

        if(servers.length === 0) {
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
                    PGADMIN_DEFAULT_EMAIL: config.adminEmail || "",
                    PGADMIN_DEFAULT_PASSWORD: config.adminPassword || "",
                    ...config.adminSkipPassword ? {
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

        if(!config.adminSkipPassword) {
            console.info(`Login: ${config.adminEmail}`);
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
        return (this.config.services || []).map((service) => {
            return service.name;
        });
    }
}
