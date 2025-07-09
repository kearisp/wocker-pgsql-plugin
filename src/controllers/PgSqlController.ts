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
    @Description("Initializes PostgreSQL functionality and opens the admin interface. Optionally configures email and password.")
    protected async init(
        @Option("email", "e")
        email?: string,
        @Option("password", "p")
        password?: string,
        @Option("skip-password", "s")
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
        @Option("user", "u")
        @Description("User name")
        user: string,
        @Option("password", "p")
        @Description("Password")
        password: string,
        @Option("host", "h")
        @Description("External host")
        host: string,
        @Option("port", "P")
        @Description("External port")
        port: string,
        @Option("image", "i")
        @Description("Image name")
        imageName?: string,
        @Option("image-version", "I")
        @Description("Image version")
        imageVersion?: string,
        @Option("container-port")
        @Description("Port on which the database container will be accessible on the host")
        containerPort?: number
    ): Promise<void> {
        await this.pgSqlService.create({
            name,
            user,
            password,
            host,
            port,
            imageName,
            imageVersion,
            containerPort
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
        @Option("image", "i")
        @Description("Image name")
        imageName?: string,
        @Option("image-version", "I")
        @Description("Image version")
        imageVersion?: string,
        @Option("container-port")
        @Description("Port on which the database container will be accessible on the host")
        containerPort?: number
    ): Promise<void> {
        await this.pgSqlService.upgrade({
            name,
            imageName,
            imageVersion,
            containerPort
        });
    }

    @Command("pgsql:destroy <service>")
    @Description("Destroys a specified PostgreSQL service.")
    protected async destroy(
        @Param("service")
        service: string,
        @Option("yes", "y")
        @Description("Don't ask for confirmation")
        yes?: boolean,
        @Option("force", "f")
        @Description("Force destroy the service")
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
        @Option("restart", "r")
        @Description("Restart the service if it's already running")
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
