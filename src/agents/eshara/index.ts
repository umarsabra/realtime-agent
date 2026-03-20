import fs from "fs";
import path from "path";


export * from "./events";
export * from "./tools";



export const instructions = fs.readFileSync(
    path.resolve(__dirname, "./instructions.md"),
    "utf-8"
);



