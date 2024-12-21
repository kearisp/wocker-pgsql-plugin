import {
    Injectable,
    AppConfigService,
    PluginConfigService,
    DockerService,
    FS,
    PickProperties,
    ProxyService
} from "@wocker/core";
import {promptText, promptConfirm} from "@wocker/utils";
import CliTable from "cli-table3";
import * as Path from "path";

import {Config} from "../makes/Config";
import {Service} from "../makes/Service";


@Injectable()
export class PgSqlService {
    protected adminContainerName = "dbadmin-pgsql.workspace";

    public constructor(
        protected readonly appConfigService: AppConfigService,
        protected readonly pluginConfigService: PluginConfigService,
        protected readonly dockerService: DockerService,
        protected readonly proxyService: ProxyService
    ) {}

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
        const config = await this.getConfig();

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
        const config = await this.getConfig();
        let service = config.getService(name);

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

        config.setService(service);

        await config.save();
    }

    public async destroy(service: string): Promise<void> {
        const config = await this.getConfig();

        config.unsetService(service);

        await config.save();
    }

    public async listTable(): Promise<string> {
        const table = new CliTable({
            head: ["Name", "Host"]
        });

        const config = await this.getConfig();

        for(const service of config.services) {
            table.push([
                service.name + (config.default === service.name ? " (default)" : ""),
                service.host || service.containerName
            ]);
        }

        return table.toString();
    }

    public async start(name?: string, restart?: boolean): Promise<void> {
        const config = await this.getConfig();
        const service = config.getServiceOrDefault(name);

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
                image: "postgres:latest",
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
        const config = await this.getConfig();
        const service = config.getServiceOrDefault(name);

        await this.dockerService.removeContainer(service.containerName);
    }

    public async admin(): Promise<void> {
        const config = await this.getConfig();

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

        await FS.writeJSON(this.pluginConfigService.dataPath("servers.json"), {
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
        const config = await this.getConfig();

        if(!config.getService(name)) {
            throw new Error(`Service "${name}" not found`);
        }

        config.default = name;

        await config.save();
    }

    public async getServices(): Promise<string[]> {
        const config = await this.getConfig();

        return (config.services || []).map((service) => {
            return service.name;
        });
    }

    protected async getConfig(): Promise<Config> {
        let data: PickProperties<Config> = !this.pluginConfigService.exists(this.configPath)
            ? {
                default: "default",
                services: [
                    {
                        name: "default",
                        user: "root",
                        password: "root"
                    }
                ]
            }
            : await this.pluginConfigService.readJSON(this.configPath);

        const _this = this;

        return new class extends Config {
            public async save(): Promise<void> {
                await _this.pluginConfigService.writeJSON(_this.configPath, this.toJSON());
            }
        }(data);
    }
}
