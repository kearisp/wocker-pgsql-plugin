import {
    Plugin,
    PluginConfigService
} from "@wocker/core";

import {PgSqlController} from "./controllers/PgSqlController";
import {PgSqlService} from "./services/PgSqlService";


@Plugin({
    name: "pgsql",
    controllers: [PgSqlController],
    providers: [
        PluginConfigService,
        PgSqlService
    ]
})
export default class PgSqlModule {}
