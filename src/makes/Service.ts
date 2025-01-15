export type ServiceProps = {
    name: string;
    user?: string;
    password?: string;
    host?: string;
    port?: string | number;
    image?: string;
    imageName?: string;
    imageVersion?: string;
};

export class Service {
    public name: string;
    public user?: string;
    public password?: string;
    public host?: string;
    public port?: string | number;
    public imageName?: string;
    public imageVersion?: string;

    public constructor(data: ServiceProps) {
        const {
            name,
            host,
            port,
            user,
            password,
            image,
            imageName = image || "postgres",
            imageVersion = "latest"
        } = data;

        this.name = name;
        this.host = host;
        this.port = port;
        this.user = user;
        this.password = password;
        this.imageName = imageName;
        this.imageVersion = imageVersion;
    }

    public get containerName(): string {
        return `pgsql-${this.name}.ws`;
    }

    public get imageTag(): string {
        return `${this.imageName}:${this.imageVersion}`;
    }

    public toObject(): ServiceProps {
        return {
            name: this.name,
            host: this.host,
            port: this.port,
            user: this.user,
            password: this.password,
            imageName: this.imageName,
            imageVersion: this.imageVersion
        };
    }
}
