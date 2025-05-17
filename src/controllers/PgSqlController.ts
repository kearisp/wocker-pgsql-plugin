import {
    Controller,
    Command,
    Completion,
    Option,
    Param,
    AppConfigService,
    DockerService,
    Description
} from "@wocker/core";
import {PgSqlService} from "../services/PgSqlService";


@Controller()
@Description("PostgreSQL commands")
export class PgSqlController {
    public constructor(
        protected readonly appConfigService: AppConfigService,
        protected readonly dockerService: DockerService,
        protected readonly pgSqlService: PgSqlService
    ) {}

    @Command("pgsql:init")
    protected async init(
        @Option("email", {
            type: "string",
            alias: "e"
        })
        email?: string,
        @Option("password", {
            type: "string",
            alias: "p"
        })
        password?: string,
        @Option("skip-password", {
            type: "boolean",
            alias: "s"
        })
        skipPassword?: boolean
    ): Promise<void> {
        await this.pgSqlService.init(email, password, skipPassword);
        await this.pgSqlService.admin();
    }

    @Command("pgsql [service]")
    @Description("Interacts with a specified PostgreSQL service.")
    public async pgsql(
        @Param("service")
        name?: string
    ): Promise<void> {
        await this.pgSqlService.pgsql(name);
    }

    @Command("pgsql:dump [service]")
    @Description("Creates a dump of the specified PostgreSQL service.")
    public async dump(
        @Param("service")
        name?: string
    ): Promise<void> {
        await this.pgSqlService.dump(name);
    }

    @Command("pgsql:create <service>")
    @Description("Creates a PostgreSQL service with configurable user, password, host, and port options.")
    protected async create(
        @Param("service")
        name: string,
        @Option("user", {
            type: "string",
            alias: "u",
            description: "User name"
        })
        user: string,
        @Option("password", {
            type: "string",
            alias: "p",
            description: "Password"
        })
        password: string,
        @Option("host", {
            type: "string",
            alias: "h",
            description: "External host"
        })
        host: string,
        @Option("port", {
            type: "number",
            alias: "P",
            description: "External port"
        })
        port: string,
        @Option("image", {
            type: "string",
            alias: "i",
            description: "Image name"
        })
        imageName?: string,
        @Option("image-version", {
            type: "string",
            alias: "I",
            description: "Image version"
        })
        imageVersion?: string
    ): Promise<void> {
        await this.pgSqlService.create({
            name,
            user,
            password,
            host,
            port,
            imageName,
            imageVersion
        });

        if(host) {
            await this.pgSqlService.admin();
        }
    }

    @Command("pgsql:upgrade [service]")
    @Description("Upgrades a PostgreSQL service with options to specify image and version.")
    protected async upgrade(
        @Param("service")
        name?: string,
        @Option("image", {
            type: "string",
            alias: "i",
            description: "Image name"
        })
        imageName?: string,
        @Option("image-version", {
            type: "string",
            alias: "I",
            description: "Image version"
        })
        imageVersion?: string
    ): Promise<void> {
        await this.pgSqlService.upgrade({
            name,
            imageName,
            imageVersion
        });
    }

    @Command("pgsql:destroy <service>")
    @Description("Destroys a specified PostgreSQL service.")
    protected async destroy(
        @Param("service")
        service: string,
        @Option("yes", {
            type: "boolean",
            alias: "y",
            description: "Don't ask for confirmation"
        })
        yes?: boolean,
        @Option("force", {
            type: "boolean",
            alias: "f",
            description: "Force destroy the service"
        })
        force?: boolean
    ): Promise<void> {
        await this.pgSqlService.destroy(service, yes, force);
        await this.pgSqlService.admin();
    }

    @Command("pgsql:ls")
    @Description("Lists all available PostgreSQL tables in the service.")
    public async list(): Promise<string> {
        return this.pgSqlService.listTable();
    }

    @Command("pgsql:start [service]")
    @Description("Starts the specified PostgreSQL service and opens the admin interface.")
    protected async start(
        @Param("service")
        service?: string,
        @Option("restart", {
            type: "boolean",
            alias: "r",
            description: "Restart the service if it's already running"
        })
        restart?: boolean
    ): Promise<void> {
        await this.pgSqlService.start(service, restart);
        await this.pgSqlService.admin();
    }

    @Command("pgsql:stop [service]")
    @Description("Stops a PostgreSQL service and opens the administration interface.")
    protected async stop(
        @Param("service")
        service?: string
    ): Promise<void> {
        await this.pgSqlService.stop(service);
        await this.pgSqlService.admin();
    }

    @Command("pgsql:use <service>")
    @Description("Sets the specified PostgreSQL service as the default.")
    public async default(
        @Param("service")
        service: string
    ): Promise<void> {
        await this.pgSqlService.setDefault(service);
    }

    @Completion("service")
    public async getServices(): Promise<string[]> {
        return this.pgSqlService.getServices();
    }
}
