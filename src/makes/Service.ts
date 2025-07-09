export const STORAGE_VOLUME = "volume";
export const STORAGE_FILESYSTEM = "filesystem";

export type ServiceStorage = typeof STORAGE_VOLUME | typeof STORAGE_FILESYSTEM;

export type ServiceProps = {
    name: string;
    user?: string;
    password?: string;
    host?: string;
    port?: string | number;
    image?: string;
    imageName?: string;
    imageVersion?: string;
    storage?: ServiceStorage;
    volume?: string;
    containerPort?: number;
};

export class Service {
    public name: string;
    public user?: string;
    public password?: string;
    public host?: string;
    public port?: string | number;
    public imageName?: string;
    public imageVersion?: string;
    public storage?: ServiceStorage;
    public _volume?: string;
    public containerPort?: number;

    public constructor(data: ServiceProps) {
        const {
            name,
            host,
            port,
            user,
            password,
            storage = STORAGE_FILESYSTEM,
            volume,
            image,
            imageName = image,
            imageVersion,
            containerPort
        } = data;

        this.name = name;
        this.host = host;
        this.port = port;
        this.user = user;
        this.password = password;
        this.storage = storage;
        this._volume = volume;
        this.imageName = imageName;
        this.imageVersion = imageVersion;
        this.containerPort = containerPort;
    }

    public get containerName(): string {
        return `pgsql-${this.name}.ws`;
    }

    public get imageTag(): string {
        let imageName = this.imageName,
            imageVersion = this.imageVersion;

        if(!imageName) {
            imageName = "postgres";
        }

        if(!imageVersion) {
            return imageName;
        }

        return `${imageName}:${imageVersion}`;
    }

    public get volume(): string {
        if(!this._volume) {
            this._volume = this.defaultVolume;
        }

        return this._volume;
    }

    public get defaultVolume(): string {
        return `wocker-pgsql-${this.name}`;
    }

    public toObject(): ServiceProps {
        return {
            name: this.name,
            host: this.host,
            port: this.port,
            user: this.user,
            password: this.password,
            imageName: this.imageName,
            imageVersion: this.imageVersion,
            storage: this.storage,
            volume: this._volume,
            containerPort: this.containerPort
        };
    }
}
