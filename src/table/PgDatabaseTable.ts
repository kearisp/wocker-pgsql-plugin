import {pgTable, text, integer, boolean, jsonb} from "drizzle-orm/pg-core";


export const PgDatabaseTable = pgTable("pg_database", {
    datname: text("datname").notNull(),
    datdba: integer("datdba").notNull(),
    encoding: integer("encoding").notNull(),
    datcollate: text("datcollate").notNull(),
    datctype: text("datctype").notNull(),
    datistemplate: boolean("datistemplate").notNull(),
    datallowconn: boolean("datallowconn").notNull(),
    datconnlimit: integer("datconnlimit").notNull(),
    datlastsysoid: integer("datlastsysoid").notNull(),
    datfrozenxid: integer("datfrozenxid").notNull(),
    datminmxid: integer("datminmxid").notNull(),
    dattablespace: integer("dattablespace").notNull(),
    datacl: jsonb("datacl")
});
