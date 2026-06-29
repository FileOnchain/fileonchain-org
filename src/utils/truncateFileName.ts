export const truncateFileName = (name: string, maxLength: number): string => {
  if (name.length <= maxLength) return name;
  const extIndex = name.lastIndexOf(".");
  const ext = extIndex !== -1 ? name.slice(extIndex) : "";
  return name.slice(0, maxLength - ext.length - 3) + "..." + ext;
};
