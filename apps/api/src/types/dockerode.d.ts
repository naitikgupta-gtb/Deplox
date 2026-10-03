// Local type shim for Dockerode.
// The published @types/dockerode package lags behind Dockerode 4.x's actual
// surface, so we declare the minimum we use. Add to this file as needed.

declare module 'dockerode' {
  interface PortBinding {
    HostPort?: string;
    HostIp?: string;
  }

  interface PortMapping {
    [containerPort: string]: PortBinding[];
  }

  interface HostConfig {
    PortBindings?: PortMapping;
    NetworkMode?: string;
    Memory?: number;
    NanoCpus?: number;
    AutoRemove?: boolean;
    User?: string;
    RestartPolicy?: { Name: string };
    ReadonlyRootfs?: boolean;
    Privileged?: boolean;
  }

  interface ContainerCreateOptions {
    Image: string;
    Env?: string[];
    ExposedPorts?: Record<string, {}>;
    HostConfig?: HostConfig;
    name?: string;
    User?: string;
  }

  interface BuildImageOptions {
    dockerfile?: string;
    t?: string;
    buildargs?: Record<string, string>;
    /** When passing a path to a tar archive, list the contents to include. */
    src?: string[];
  }

  interface Container {
    id: string;
    start(): Promise<void>;
    stop(opts?: { t?: number }): Promise<void>;
    remove(opts?: { force?: boolean }): Promise<void>;
    logs(
      opts: { stdout?: boolean; stderr?: boolean; follow?: boolean; tail?: number },
      callback: (
        err: Error | null,
        stream: NodeJS.ReadableStream | null,
      ) => void,
    ): void;
  }

  interface Dockerode {
    buildImage(
      context: string,
      opts: BuildImageOptions,
    ): NodeJS.ReadableStream;
    createContainer(opts: ContainerCreateOptions): Promise<Container>;
    getContainer(id: string): Container;
    modem: {
      followProgress(
        stream: NodeJS.ReadableStream,
        onFinished: (err: Error | null) => void,
        onProgress?: (event: { stream?: string; error?: string }) => void,
      ): void;
    };
  }

  const Dockerode: new () => Dockerode;
  export default Dockerode;
}