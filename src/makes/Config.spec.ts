import {describe, it, expect} from "@jest/globals";
import {Config} from "./Config";
import {Service} from "./Service";


class TestConfig extends Config {
    public save(): void {}
}

describe("Config", (): void => {
    it("should default admin to enabled with no credentials", (): void => {
        const config = new TestConfig();

        expect(config.admin).toEqual({
            enabled: true,
            host: undefined,
            email: undefined,
            password: undefined,
            skipPassword: undefined
        });
        expect(config.services).toEqual([]);
        expect(config.default).toBeUndefined();
    });

    it("should fall back to deprecated top-level admin fields", (): void => {
        const config = new TestConfig({
            adminHost: "legacy-admin.ws",
            adminEmail: "legacy@pgsql.ws",
            adminPassword: "legacy-pass",
            adminSkipPassword: true
        } as any);

        expect(config.admin).toEqual({
            enabled: true,
            host: "legacy-admin.ws",
            email: "legacy@pgsql.ws",
            password: "legacy-pass",
            skipPassword: true
        });
    });

    it("getService should return null for an unknown service", (): void => {
        const config = new TestConfig();

        expect(config.getService("missing")).toBeNull();
    });

    it("getDefaultService should return null when no default is set", (): void => {
        const config = new TestConfig();

        expect(config.getDefaultService()).toBeNull();
    });

    it("getServiceOrDefault should throw when nothing can be resolved", (): void => {
        const config = new TestConfig();

        expect(() => config.getServiceOrDefault()).toThrow("Service not found");
        expect(() => config.getServiceOrDefault("missing")).toThrow("Service not found");
    });

    it("setService should make the first service the default", (): void => {
        const config = new TestConfig();

        config.setService(new Service({name: "first"}));

        expect(config.default).toBe("first");
        expect(config.getServiceOrDefault().name).toBe("first");
    });

    it("setService should replace an existing service in place without changing default", (): void => {
        const config = new TestConfig({
            default: "first",
            services: [
                {name: "first", image: "postgres:15-alpine"}
            ]
        });

        config.setService(new Service({name: "first", image: "postgres:16-alpine"}));

        expect(config.services).toHaveLength(1);
        expect(config.default).toBe("first");
        expect(config.getService("first")?.image).toBe("postgres:16-alpine");
    });

    it("unsetService should remove the service and clear default when it matches", (): void => {
        const config = new TestConfig({
            default: "first",
            services: [
                {name: "first", image: "postgres:15-alpine"}
            ]
        });

        config.unsetService("first");

        expect(config.hasService("first")).toBe(false);
        expect(config.default).toBeUndefined();
    });

    it("unsetService should leave default untouched when removing another service", (): void => {
        const config = new TestConfig({
            default: "first",
            services: [
                {name: "first", image: "postgres:15-alpine"},
                {name: "second", image: "postgres:15-alpine"}
            ]
        });

        config.unsetService("second");

        expect(config.hasService("second")).toBe(false);
        expect(config.default).toBe("first");
    });

    it("toJSON should omit an empty services array", (): void => {
        const config = new TestConfig();

        expect(config.toJSON().services).toBeUndefined();
    });
});
