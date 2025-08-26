import {FileSystem, PickProperties} from "@wocker/core";
import {Service, ServiceProps} from "./Service";


export type AdminConfig = {
    enabled: boolean;
    host?: string;
    email?: string;
    password?: string;
    skipPassword?: boolean;
};

export type ConfigProps = Omit<PickProperties<Config>, "admin" | "services"> & {
    /** @deprecated */
    adminHost?: string;
    /** @deprecated */
    adminEmail?: string;
    /** @deprecated */
    adminPassword?: string;
    /** @deprecated */
    adminSkipPassword?: boolean;
    admin?: AdminConfig;
    services?: ServiceProps[];
};

export abstract class Config {
    public default?: string;
    public admin: AdminConfig;
    public services: Service[];

    public constructor(data?: ConfigProps) {
        const {
            default: defaultService,
            admin: {
                enabled: adminEnabled = true,
                host: adminHost = data?.adminHost,
                email: adminEmail = data?.adminEmail,
                password: adminPassword = data?.adminPassword,
                skipPassword: adminSkipPassword = data?.adminSkipPassword
            } = {},
            services = []
        } = data || {};

        this.default = defaultService;
        this.admin = {
            enabled: adminEnabled,
            host: adminHost,
            email: adminEmail,
            password: adminPassword,
            skipPassword: adminSkipPassword
        };
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

        if(!this.default) {
            this.default = service.name;
        }
    }

    public unsetService(name: string): void {
        this.services = this.services.filter((service) => {
            return service.name !== name;
        });

        if(this.default === name) {
            delete this.default;
        }
    }

    public abstract save(): void;

    public toJSON(): ConfigProps {
        return {
            default: this.default,
            admin: this.admin,
            services: this.services.length > 0 ? this.services.map((service) => {
                return service.toObject();
            }) : undefined
        };
    }

    public static make(fs: FileSystem): Config {
        const data: ConfigProps = fs.exists("config.json")
            ? fs.readJSON("config.json")
            : {};

        return new class extends Config {
            public save(): void {
                if(!fs.exists("")) {
                    fs.mkdir("", {
                        recursive: true
                    });
                }

                fs.writeJSON("config.json", this.toJSON());
            }
        }(data);
    }
}
