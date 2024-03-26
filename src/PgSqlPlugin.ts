import {
    Injectable,
    Cli,
    FS
} from "@wocker/core";
import {promptText} from "@wocker/utils";
import {
    AppConfigService,
    DockerService,
    Plugin
} from "@wocker/ws";
import {existsSync, mkdirSync} from "fs";


type CreateOptions = {
    password?: string;
    "root-password"?: string;
};

type StartOptions = {
    restart?: boolean;
};

type StopOptions = {};

@Injectable()
export class PgSqlPlugin extends Plugin {
    protected containerName = "pgsql.workspace";
    protected adminContainerName = "dbadmin-pgsql.workspace";
    protected passwordKey = "POSTGRES_PASSWORD";
    protected dbDir: string;

    public constructor(
        private readonly appConfigService: AppConfigService,
        private readonly dockerService: DockerService
    ) {
        super("pgsql");

        this.dbDir = this.appConfigService.dataPath("db/pgsql");
    }

    public install(cli: Cli): void {
        cli.command("pgsql:create <service>")
            .action((options, service) => this.create(options, service as string));

        cli.command("pgsql:start")
            .option("restart", {
                type: "boolean",
                alias: "r",
                description: "Restarting if started"
            })
            .action((options) => this.start(options));

        cli.command("pgsql:stop")
            .action((options) => this.stop(options));
    }

    protected async initPassword() {
        let password = await this.appConfigService.getMeta(this.passwordKey);

        if(!password) {
            password = await promptText({
                required: true,
                message: "Password:",
                type: "string"
            });

            await this.appConfigService.setMeta(this.passwordKey, password);
        }
    }

    protected async create(options: CreateOptions, service: string) {
        const {
            password,
            "root-password": rootPassword
        } = options;

        const config = await FS.readJSON(this.dataPath("config.json"));

        await FS.writeJSON(this.dataPath("config.json"), {
            ...config,
            [service]: {
                password,
                rootPassword
            }
        });

        console.log(config);
    }

    protected async start(options: StartOptions) {
        const {
            restart
        } = options;

        if(!existsSync(this.dataPath())) {
            mkdirSync(this.dataPath(), {
                recursive: true
            });
        }

        await this.initPassword();
        await this.startDB(restart)
        await this.startAdmin(restart);
    }

    protected async startDB(restart?: boolean) {
        console.info("Starting postgres...");

        if(restart) {
            await this.dockerService.removeContainer(this.containerName);
        }

        let container = await this.dockerService.getContainer(this.containerName);

        if(!container) {
            container = await this.dockerService.createContainer({
                name: this.containerName,
                image: "postgres:latest",
                restart: "always",
                volumes: [
                    `${this.dbDir}:/var/lib/postgresql/data`
                ],
                env: {
                    POSTGRES_USER: "root",
                    POSTGRES_PASSWORD: await this.appConfigService.getMeta(this.passwordKey)
                }
            });
        }

        const {
            State: {
                Status
            }
        } = await container.inspect();

        if(Status === "created" || Status === "exited") {
            await container.start();
        }
    }

    protected async startAdmin(restart?: boolean) {
        console.info("Starting pgadmin4...");

        if(restart) {
            await this.dockerService.removeContainer(this.adminContainerName);
        }

        let container = await this.dockerService.getContainer(this.adminContainerName);

        if(!container) {
            await FS.writeFile(this.dataPath("pgpass"), `${this.containerName}:5432:postgres:root:${await this.appConfigService.getMeta(this.passwordKey)}`);

            await FS.writeJSON(this.dataPath("servers.json"), {
                Servers: {
                    "1": {
                        "Group": "Servers",
                        "Name": this.containerName,
                        "Host": this.containerName,
                        "Port": 5432,
                        "MaintenanceDB": "postgres",
                        "Username": "root",
                        "PassFile": "/pgadmin4/pgpass",
                        "SSLMode": "prefer"
                    }
                }
            });

            container = await this.dockerService.createContainer({
                name: this.adminContainerName,
                image: "dpage/pgadmin4:latest",
                restart: "always",

                links: [
                    `${this.containerName}:postgres`
                ],
                volumes: [
                    `${this.dataPath("pgpass")}:/pgadmin4/pgpass`,
                    `${this.dataPath("servers.json")}:/pgadmin4/servers.json`
                ],
                env: {
                    PGADMIN_DEFAULT_EMAIL: "root@pgsql.ws",
                    PGADMIN_DEFAULT_PASSWORD: await this.appConfigService.getMeta(this.passwordKey),
                    VIRTUAL_HOST: this.adminContainerName
                }
            });
        }

        const {
            State: {
                Status
            }
        } = await container.inspect();

        if(Status === "created" || Status === "exited") {
            await container.start();
        }
    }

    protected async stop(options: StopOptions) {
        await this.dockerService.removeContainer(this.containerName);
        await this.dockerService.removeContainer(this.adminContainerName);
    }
}
