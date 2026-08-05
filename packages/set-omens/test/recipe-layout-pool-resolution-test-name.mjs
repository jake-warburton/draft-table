export const exactTestNamePattern = (name) => `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
