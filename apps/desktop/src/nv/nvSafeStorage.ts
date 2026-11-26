// Electron names its macOS Keychain entry after the product name. Builds from before the
// rename stored it as "Nightshift Code Safe Storage", so the renamed app would mint a new key
// and could no longer read saved environment tokens, the connection catalog or cookies.
const LEGACY_PRODUCT_NAME = "Nightshift Code";

export interface SafeStorageExec {
  /** Runs `security` with these arguments and returns stdout; throws when it fails. */
  readonly security: (args: ReadonlyArray<string>, stdin?: string) => string;
}

const serviceName = (productName: string) => `${productName} Safe Storage`;
const accountName = (productName: string) => `${productName} Key`;

/**
 * Copies the pre-rename Safe Storage key to the NV-CODE entry once, before Electron reads it.
 * macOS asks once for permission to read the old entry. Nothing happens when the NV-CODE
 * entry already exists or there is no old one.
 */
export function copyLegacySafeStorageKey(input: {
  readonly productName: string;
  readonly execPath: string;
  readonly isPackaged: boolean;
  readonly platform: string;
  readonly exec: SafeStorageExec;
  readonly log: (message: string) => void;
}): void {
  if (!input.isPackaged || input.platform !== "darwin") return;
  if (input.productName === LEGACY_PRODUCT_NAME) return;
  const exists = (productName: string) => {
    try {
      input.exec.security(["find-generic-password", "-s", serviceName(productName)]);
      return true;
    } catch {
      return false;
    }
  };
  if (exists(input.productName) || !exists(LEGACY_PRODUCT_NAME)) return;

  let secret: string;
  try {
    secret = input.exec
      .security([
        "find-generic-password",
        "-s",
        serviceName(LEGACY_PRODUCT_NAME),
        "-a",
        accountName(LEGACY_PRODUCT_NAME),
        "-w",
      ])
      .replace(/\n$/, "");
  } catch (error) {
    input.log(`NV-CODE: could not read the pre-rename Keychain key: ${String(error)}`);
    return;
  }
  if (!secret || /["\\\n]/.test(secret)) {
    input.log("NV-CODE: the pre-rename Keychain key has an unexpected form; it was not copied.");
    return;
  }
  // `security -i` reads the command from stdin, so the key never appears in a process list.
  const quote = (value: string) => `"${value}"`;
  const command = [
    "add-generic-password",
    "-U",
    "-s",
    quote(serviceName(input.productName)),
    "-a",
    quote(accountName(input.productName)),
    "-T",
    quote(input.execPath),
    "-w",
    quote(secret),
  ].join(" ");
  try {
    input.exec.security(["-i"], `${command}\n`);
    input.log("NV-CODE: copied the pre-rename Keychain key.");
  } catch (error) {
    input.log(`NV-CODE: could not copy the pre-rename Keychain key: ${String(error)}`);
  }
}
