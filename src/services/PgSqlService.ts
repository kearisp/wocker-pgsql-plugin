import {
    Injectable,
    AppConfigService,
    PluginConfigService,
    DockerService,
    FileSystem,
    ProxyService
} from "@wocker/core";
import {promptText, promptConfirm} from "@wocker/utils";
import CliTable from "cli-table3";
import * as Path from "path";

import {Config, ConfigProps} from "../makes/Config";
import {Service} from "../makes/Service";


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
                data: ConfigProps = fs.exists("config.json") ? fs.readJSON("config.json") : {};

            this._config = new class extends Config {
                public save(): void {
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

    public get dbDir(): string {
        return this.appConfigService.dataPath("db/pgsql");
    }

    public get configPath(): string {
        return "config.json";
    }

    public dbPath(service: string): string {
        return Path.join(this.dbDir, service);
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

        await config.save();
    }

    public async create(name: string, user?: string, password?: string, host?: string, port?: string): Promise<void> {
        let service = this.config.getService(name);

        if(!service) {
            service = new Service({
                name,
                user,
                password,
                host,
                port
            });
        }

        if(!service.user) {
            service.user = await promptText({
                message: "Database user:",
                type: "string",
                default: service.user
            });
        }

        if(!service.password) {
            service.password = await promptText({
                message: "Database password:",
                type: "password",
                default: service.password
            });
        }

        this.config.setService(service);
        this.config.save();
    }

    public async upgrade(name?: string, image?: string, imageVersion?: string): Promise<void> {
        const service = this.config.getServiceOrDefault(name);

        if(image) {
            service.image = image;
        }

        if(imageVersion) {
            service.imageVersion = imageVersion;
        }

        this.config.setService(service);

        this.config.save();
    }

    public async destroy(service: string): Promise<void> {
        this.config.unsetService(service);
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

            container = await this.dockerService.createContainer({
                name: service.containerName,
                image: `${service.image}:${service.imageVersion}`,
                restart: "always",
                volumes: [
                    `${this.dbPath(service.name)}:/var/lib/postgresql/data`
                ],
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
                    `${this.pluginConfigService.dataPath("servers.json")}:/pgadmin4/servers.json`
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

        await config.save();
    }

    public async getServices(): Promise<string[]> {
        return (this.config.services || []).map((service) => {
            return service.name;
        });
    }
}
