import {PickProperties} from "@wocker/core";

import {Service, ServiceProps} from "./Service";


export type ConfigProps = Omit<PickProperties<Config>, "services"> & {
    services?: ServiceProps[];
};

export abstract class Config {
    public default?: string;
    public adminEmail?: string;
    public adminPassword?: string;
    public adminSkipPassword?: boolean;
    public services: Service[];

    protected constructor(data?: ConfigProps) {
        const {
            adminEmail,
            adminPassword,
            adminSkipPassword,
            default: defaultService,
            services = []
        } = data || {};

        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
        this.adminSkipPassword = adminSkipPassword;
        this.default = defaultService;
        this.services = services.map((s) => {
            return new Service(s);
        });
    }

    public getService(name: string): Service | null {
        const service = this.services.find((service) => {
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

    public setService(name: string, service: Omit<ServiceProps, "name">): void {
        this.services = [
            ...this.services.filter((service) => {
                return service.name !== name;
            }),
            new Service({
                name,
                ...service
            })
        ];
    }

    public unsetService(name: string): void {
        this.services = this.services.filter((service) => {
            return service.name !== name;
        });
    }

    public abstract save(): Promise<void>;

    public toJSON() {
        return {
            adminEmail: this.adminEmail,
            adminPassword: this.adminPassword,
            adminSkipPassword: this.adminSkipPassword,
            default: this.default,
            services: this.services.length > 0 ? this.services.map((service) => {
                return service.toJSON();
            }) : undefined
        };
    }
}
