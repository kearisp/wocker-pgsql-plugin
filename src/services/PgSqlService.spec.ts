import {describe, it, expect, beforeAll} from "@jest/globals";
import Path from "path";
import {vol} from "memfs";
import {
    ApplicationContext,
    DockerService,
    LogService,
    PluginConfigService,
    FILE_SYSTEM_DRIVER_KEY,
    PLUGIN_DIR_KEY
} from "@wocker/core";
import DockerModule from "@wocker/docker-module";
import DockerMockModule, {Fixtures} from "@wocker/docker-mock-module";
import {Test} from "@wocker/testing";
import {PgSqlService} from "./PgSqlService";
import {StorageType} from "../types/StorageType";


describe("PgSqlService", (): void => {
    const ROOT_DIR = Path.join(__dirname, "..", "..");
    const fixtures = Fixtures.fromPath(Path.join(ROOT_DIR, "fixtures"));

    let context: ApplicationContext;
    let pgSqlService: PgSqlService;

    beforeAll(async (): Promise<void> => {
        vol.reset();

        context = await Test
            .createTestingModule({
                imports: [
                    DockerModule
                ],
                providers: [
                    PgSqlService,
                    PluginConfigService,
                    {
                        provide: PLUGIN_DIR_KEY,
                        useValue: "/wocker-test/plugins/pgsql"
                    },
                    {
                        provide: "PROXY_SERVICE",
                        useValue: {
                            start: async () => undefined
                        }
                    }
                ]
            })
            .overrideProvider(FILE_SYSTEM_DRIVER_KEY).useValue(vol)
            .overrideProvider(LogService).useValue({
                info: () => undefined,
                debug: () => undefined,
                warn: () => undefined,
                error: () => undefined
            })
            .overrideModule(DockerModule).useModule(DockerMockModule.withFixtures(fixtures))
            .build();

        pgSqlService = context.get(PgSqlService);
    });

    it("should create, start, list, stop and destroy a service", async (): Promise<void> => {
        await pgSqlService.create({
            name: "test",
            user: "root",
            password: "root",
            image: "postgres:latest",
            storage: StorageType.FS,
            containerPort: 15432
        });

        expect(pgSqlService.config.hasService("test")).toBe(true);
        expect(pgSqlService.config.default).toBe("test");

        await pgSqlService.start("test");

        const service = pgSqlService.config.getService("test");

        expect(service).not.toBeNull();

        const dockerService = context.get(DockerService);

        const runningContainer = await dockerService.getContainer(service!.containerName);

        expect(runningContainer).not.toBeNull();

        const runningInspect = await runningContainer!.inspect();

        expect(runningInspect.State.Running).toBe(true);

        const list = await pgSqlService.listTable();

        expect(list).toContain("test (default)");

        await pgSqlService.stop("test");

        const stoppedContainer = await dockerService.getContainer(service!.containerName);

        expect(stoppedContainer).toBeNull();

        await pgSqlService.destroy("test", true, true);

        expect(pgSqlService.config.hasService("test")).toBe(false);
    });
});
