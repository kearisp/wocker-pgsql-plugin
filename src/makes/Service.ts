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
    public _image?: string;
    public _imageName?: string;
    public _imageVersion?: string;
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
            image,
            imageName,
            imageVersion,
            containerPort,
            storage = STORAGE_FILESYSTEM,
            volume
        } = data;

        this.name = name;
        this.host = host;
        this.port = port;
        this.user = user;
        this.password = password;
        this._image = image;
        this._imageName = imageName;
        this._imageVersion = imageVersion;
        this.containerPort = containerPort;
        this.storage = storage;
        this._volume = volume;
    }

    public get isExternal(): boolean {
        return !!this.host;
    }

    public get auth(): string[] {
        const cmd: string[] = [];

        if(this.user) {
            cmd.push("-U", this.user);
        }

        if(this.isExternal) {
            if(this.host) {
                cmd.push("--host", this.host);
            }

            if(this.port) {
                cmd.push("--port", `${this.port}`);
            }
        }

        return cmd;
    }

    public get containerName(): string {
        return `pgsql-${this.name}.ws`;
    }

    public get image(): string {
        if(!this._image) {
            let imageName = this._imageName,
                imageVersion = this._imageVersion;

            if(!imageName) {
                imageName = "postgres";
            }

            if(!imageVersion) {
                return imageName;
            }

            return `${imageName}:${imageVersion}`;
        }

        return this._image;
    }

    public set image(image: string) {
        this._image = image;
    }

    public set imageName(imageName: string) {
        const [, imageVersion] = this.image.split(":");

        this._image = !imageVersion ? imageName : `${imageName}:${imageVersion}`;
    }

    public set imageVersion(imageVersion: string) {
        const [imageName] = this.image.split(":");

        this._image = `${imageName}:${imageVersion}`;
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
            image: this.image,
            containerPort: this.containerPort,
            storage: this.storage,
            volume: this._volume
        };
    }
}
