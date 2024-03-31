import {
    Module,
    PluginConfigService
} from "@wocker/core";

import {PgSqlController} from "./controllers/PgSqlController";
import {PgSqlService} from "./services/PgSqlService";


@Module({
    name: "pgsql",
    controllers: [PgSqlController],
    providers: [
        PluginConfigService,
        PgSqlService
    ]
})
export default class PgSqlModule {}
