export type OptionalDocResult = {
    status: 'missing';
} | {
    status: 'ok';
    content: string;
} | {
    status: 'error';
};
/** Reads an optional project doc (spec, constitution) relative to projectRoot. */
export declare function readOptionalProjectDoc(projectRoot: string, relativePath: string): OptionalDocResult;
