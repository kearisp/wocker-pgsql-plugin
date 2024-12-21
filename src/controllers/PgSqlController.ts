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
    public async pgsql(
        @Param("service")
        name?: string
    ): Promise<void> {

    }

    @Command("pgsql:create <service>")
    protected async create(
        @Param("service")
        service: string,
        @Option("user", {
            type: "string",
            alias: "u",
            description: "User"
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
            alias: "p",
            description: "External port"
        })
        port: string
    ): Promise<void> {
        await this.pgSqlService.create(service, user, password, host, port);

        if(host) {
            await this.pgSqlService.admin();
        }
    }

    @Command("pgsql:destroy <service>")
    protected async destroy(
        @Param("service")
        service: string
    ): Promise<void> {
        await this.pgSqlService.destroy(service);
    }

    @Command("pgsql:ls")
    @Description("")
    public async list(): Promise<string> {
        return this.pgSqlService.listTable();
    }

    @Command("pgsql:start [service]")
    protected async start(
        @Param("service")
        service?: string,
        @Option("restart", {
            type: "boolean",
            alias: "r",
            description: "Restart service"
        })
        restart?: boolean
    ): Promise<void> {
        await this.pgSqlService.start(service, restart);
        await this.pgSqlService.admin();
    }

    @Command("pgsql:stop [service]")
    protected async stop(
        @Param("service")
        service?: string
    ): Promise<void> {
        await this.pgSqlService.stop(service);
        await this.pgSqlService.admin();
    }

    @Command("pgsql:use <service>")
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
