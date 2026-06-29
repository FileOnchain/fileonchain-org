type SetFileContent = (content: string | null) => void;

export const readFileContent = (file: File, setFileContent: SetFileContent) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") {
      setFileContent(reader.result);
    }
  };
  if (file.type.startsWith("image/")) {
    reader.readAsDataURL(file);
  } else if (file.type.startsWith("text/") || file.type === "application/json") {
    reader.readAsText(file);
  }
};
