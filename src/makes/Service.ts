import {PickProperties} from "@wocker/core";


export type ServiceProps = Omit<PickProperties<Service>, "containerName">;

export class Service {
    public name: string;
    public user?: string;
    public password?: string;
    public host?: string;
    public port?: string | number;

    public constructor(data: ServiceProps) {
        const {
            name,
            host,
            port,
            user,
            password
        } = data;

        this.name = name;
        this.host = host;
        this.port = port;
        this.user = user;
        this.password = password;
    }

    public get containerName(): string {
        return `pgsql-${this.name}.ws`;
    }

    public toJSON(): ServiceProps {
        return {
            name: this.name,
            host: this.host,
            port: this.port,
            user: this.user,
            password: this.password
        };
    }
}
