import {describe, it, expect} from "@jest/globals";
import {Service} from "./Service";
import {StorageType} from "../types/StorageType";


describe("Service", (): void => {
    it("should build the container name from the service name", (): void => {
        const service = new Service({
            name: "test"
        });

        expect(service.containerName).toBe("pgsql-test.ws");
    });

    it("should default to postgres:18-alpine when no image is set", (): void => {
        const service = new Service({
            name: "test"
        });

        expect(service.image).toBe("postgres:18-alpine");
    });

    it("should keep an explicitly provided image", (): void => {
        const service = new Service({
            name: "test",
            image: "postgres:15-alpine"
        });

        expect(service.image).toBe("postgres:15-alpine");
    });

    it("should build image from deprecated imageName/imageVersion", (): void => {
        const service = new Service({
            name: "test",
            imageName: "postgres",
            imageVersion: "16"
        } as any);

        expect(service.image).toBe("postgres:16");
    });

    it("should reject an invalid image on assignment", (): void => {
        const service = new Service({
            name: "test"
        });

        expect(() => {
            service.image = "Not A Valid Image!!";
        }).toThrow("Invalid image Not A Valid Image!!");
    });

    it("should clear the image override when set to undefined", (): void => {
        const service = new Service({
            name: "test",
            image: "postgres:15-alpine"
        });

        service.image = undefined;

        expect(service.image).toBe("postgres:18-alpine");
    });

    it("should default the volume name from the service name", (): void => {
        const service = new Service({
            name: "test"
        });

        expect(service.volume).toBe("wocker-pgsql-test");
        expect(service.defaultVolume).toBe("wocker-pgsql-test");
    });

    it("should keep an explicitly provided volume name", (): void => {
        const service = new Service({
            name: "test",
            volume: "custom-volume"
        });

        expect(service.volume).toBe("custom-volume");
        expect(service.defaultVolume).toBe("wocker-pgsql-test");
    });

    it("should use the legacy data dir for postgres images older than 18", (): void => {
        const service = new Service({
            name: "test",
            image: "postgres:15-alpine"
        });

        expect(service.internalVolume).toBe("/var/lib/postgresql/data");
    });

    it("should use the new data dir for postgres 18+", (): void => {
        const service = new Service({
            name: "test",
            image: "postgres:18-alpine"
        });

        expect(service.internalVolume).toBe("/var/lib/postgresql");
    });

    it("should fall back to the legacy data dir when the tag has no version prefix", (): void => {
        const service = new Service({
            name: "test",
            image: "postgres:latest"
        });

        expect(service.internalVolume).toBe("/var/lib/postgresql/data");
    });

    it("should not treat a local service as external", (): void => {
        const service = new Service({
            name: "test"
        });

        expect(service.isExternal).toBe(false);
        expect(service.auth).toEqual([]);
    });

    it("should build psql auth args for a local service with a user", (): void => {
        const service = new Service({
            name: "test",
            user: "root"
        });

        expect(service.auth).toEqual(["-U", "root"]);
    });

    it("should treat a host-backed service as external and include host/port in auth args", (): void => {
        const service = new Service({
            name: "test",
            user: "root",
            host: "db.example.com",
            port: 5433
        });

        expect(service.isExternal).toBe(true);
        expect(service.auth).toEqual(["-U", "root", "--host", "db.example.com", "--port", "5433"]);
    });

    it("should round-trip through toObject", (): void => {
        const service = new Service({
            name: "test",
            user: "root",
            password: "toor",
            image: "postgres:15-alpine",
            containerPort: 5433,
            storage: StorageType.VOLUME,
            volume: "custom-volume"
        });

        expect(service.toObject()).toEqual({
            name: "test",
            host: undefined,
            port: undefined,
            user: "root",
            password: "toor",
            image: "postgres:15-alpine",
            containerPort: 5433,
            storage: StorageType.VOLUME,
            volume: "custom-volume"
        });
    });
});
