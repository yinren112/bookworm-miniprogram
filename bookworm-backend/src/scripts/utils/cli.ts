import * as fs from "fs";
import * as iconv from "iconv-lite";

export type SupportedEncoding = "utf8" | "gbk";

export interface ParsedCliArgs {
  encoding: SupportedEncoding;
  positional: string[];
}

function isSupportedEncoding(value: string): value is SupportedEncoding {
  return value === "utf8" || value === "gbk";
}

export function parseEncodingArgs(argv = process.argv.slice(2)): ParsedCliArgs {
  const encodingFlagIndex = argv.indexOf("--encoding");
  if (encodingFlagIndex === -1 || encodingFlagIndex === argv.length - 1) {
    throw new Error("Missing required --encoding <gbk|utf8> flag");
  }

  const encodingValue = argv[encodingFlagIndex + 1].toLowerCase();
  if (!isSupportedEncoding(encodingValue)) {
    throw new Error(`Unsupported encoding "${encodingValue}". Use one of: gbk, utf8`);
  }

  const positional = [
    ...argv.slice(0, encodingFlagIndex),
    ...argv.slice(encodingFlagIndex + 2),
  ];

  return {
    encoding: encodingValue,
    positional,
  };
}

export function readFileWithEncoding(filePath: string, encoding: SupportedEncoding): string {
  const data = fs.readFileSync(filePath);
  return iconv.decode(data, encoding);
}
