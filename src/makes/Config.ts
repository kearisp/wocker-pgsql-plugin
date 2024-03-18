import {PickProperties} from "@wocker/core";

import {Service} from "../types";


export abstract class Config {
    default?: string;
    adminEmail?: string;
    adminPassword?: string;
    adminSkipPassword?: boolean;
    services?: Service[];

    protected constructor(data: PickProperties<Config>) {
        const {
            adminEmail,
            adminPassword,
            adminSkipPassword,
            default: defaultService,
            services
        } = data;

        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
        this.adminSkipPassword = adminSkipPassword;
        this.default = defaultService;
        this.services = services;
    }

    public getService(name: string): Service | null {
        const service = (this.services || []).find((service) => {
            return service.name === name;
        });

        return service || null;
    }

    public getDefaultService(): Service | null {
        if(!this.default) {
            return null;
        }

        return this.getService(this.default);
    }

    public getServiceOrDefault(name?: string): Service {
        const service = name
            ? this.getService(name)
            : this.getDefaultService();

        if(!service) {
            throw new Error("Service not found");
        }

        return service;
    }

    public setService(name: string, service: Omit<Service, "name">): void {
        this.services = [
            ...(this.services || []).filter((service) => {
                return service.name !== name;
            }),
            {
                name,
                ...service
            }
        ];
    }

    public unsetService(name: string): void {
        this.services = (this.services || []).filter((service) => {
            return service.name !== name;
        });
    }

    public abstract save(): Promise<void>;

    public static getContainerName(name: string): string {
        return `pgsql-${name}.ws`;
    }

    public toJSON() {
        return {
            adminEmail: this.adminEmail,
            adminPassword: this.adminPassword,
            adminSkipPassword: this.adminSkipPassword,
            default: this.default,
            services: this.services
        };
    }
}
