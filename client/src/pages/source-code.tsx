import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FileCode, FolderOpen, Search, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SourceCodePage() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: files = [], isLoading: filesLoading } = useQuery<string[]>({
    queryKey: ["/api/source/files"],
    queryFn: async () => {
      const res = await fetch("/api/source/files", { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const { data: fileData, isLoading: fileLoading } = useQuery<{ path: string; content: string }>({
    queryKey: ["/api/source/file", selectedFile],
    queryFn: async () => {
      const res = await fetch(`/api/source/file?path=${encodeURIComponent(selectedFile!)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    enabled: !!selectedFile,
  });

  const filteredFiles = files.filter((f) =>
    f.toLowerCase().includes(search.toLowerCase())
  );

  const grouped: Record<string, string[]> = {};
  for (const f of filteredFiles) {
    const parts = f.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    if (!grouped[folder]) grouped[folder] = [];
    grouped[folder].push(f);
  }

  const handleCopy = async () => {
    if (fileData?.content) {
      await navigator.clipboard.writeText(fileData.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="px-6 py-4 border-b">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-source-title">
          Código Fuente
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {files.length} archivos del proyecto
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 border-r flex flex-col overflow-hidden shrink-0">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar archivo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-source-search"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filesLoading ? (
              <div className="p-3 space-y-2">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([folder, folderFiles]) => (
                <div key={folder}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 flex items-center gap-1.5 sticky top-0">
                    <FolderOpen className="h-3.5 w-3.5" />
                    {folder}
                  </div>
                  {folderFiles.map((f) => {
                    const fileName = f.split("/").pop()!;
                    return (
                      <button
                        key={f}
                        onClick={() => setSelectedFile(f)}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-1.5 truncate ${
                          selectedFile === f ? "bg-accent font-medium" : ""
                        }`}
                        data-testid={`btn-file-${fileName}`}
                      >
                        <FileCode className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{fileName}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedFile ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-2">
                <FileCode className="h-12 w-12 mx-auto opacity-30" />
                <p>Seleccioná un archivo para ver su código</p>
              </div>
            </div>
          ) : fileLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(20)].map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : fileData ? (
            <>
              <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                <span className="text-sm font-medium truncate" data-testid="text-current-file">
                  {fileData.path}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {fileData.content.split("\n").length} líneas
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    data-testid="btn-copy-code"
                  >
                    {copied ? (
                      <><Check className="h-3.5 w-3.5 mr-1" /> Copiado</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5 mr-1" /> Copiar</>
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                <pre className="p-4 text-xs leading-relaxed font-mono whitespace-pre overflow-x-auto">
                  <code data-testid="text-file-content">{fileData.content}</code>
                </pre>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
