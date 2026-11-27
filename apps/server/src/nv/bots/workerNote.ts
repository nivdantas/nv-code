// Earlier builds saved one note per finished worker turn under this name; they are removed.
const RETIRED_WORKER_NOTE = /^worker-run-[0-9a-f]{48}\.md$/u;

export const isRetiredWorkerNote = (fileName: string) => RETIRED_WORKER_NOTE.test(fileName);
