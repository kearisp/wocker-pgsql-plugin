import {PickProperties} from "@wocker/core";

import {Service, ServiceProps} from "./Service";


export type ConfigProps = Omit<PickProperties<Config>, "services"> & {
    services?: ServiceProps[];
};

export abstract class Config {
    public default?: string;
    public adminHost?: string;
    public adminEmail?: string;
    public adminPassword?: string;
    public adminSkipPassword?: boolean;
    public services: Service[];

    public constructor(data?: ConfigProps) {
        const {
            adminHost,
            adminEmail,
            adminPassword,
            adminSkipPassword,
            default: defaultService,
            services = []
        } = data || {};

        this.adminHost = adminHost;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
        this.adminSkipPassword = adminSkipPassword;
        this.default = defaultService;
        this.services = services.map((s) => {
            return new Service(s);
        });
    }

    public hasService(name: string): boolean {
        const service = this.services.find((service) => {
            return service.name === name;
        });

        return !!service;
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

    public setService(service: Service): void {
        let exists = false;

        for(let i = 0; i < this.services.length; i++) {
            if(this.services[i].name === service.name) {
                exists = true;
                this.services[i] = service;
            }
        }

        if(!exists) {
            this.services.push(service);
        }
    }

    public unsetService(name: string): void {
        this.services = this.services.filter((service) => {
            return service.name !== name;
        });
    }

    public abstract save(): void;

    public toJSON(): ConfigProps {
        return {
            adminHost: this.adminHost,
            adminEmail: this.adminEmail,
            adminPassword: this.adminPassword,
            adminSkipPassword: this.adminSkipPassword,
            default: this.default,
            services: this.services.length > 0 ? this.services.map((service) => {
                return service.toObject();
            }) : undefined
        };
    }
}
