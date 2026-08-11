import { useState, useCallback, createContext, useContext } from "react";
import { AlertTriangle, Trash2, Archive, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/i18n";

export type DestructiveChoice = "archive" | "delete" | "reverse" | null;

interface Request {
  title: string;
  description?: string;
  /** Show the "create a reversing entry instead" option (posted transactions). */
  allowReverse?: boolean;
  allowArchive?: boolean;
  resolve: (choice: DestructiveChoice) => void;
}

const Ctx = createContext<((r: Omit<Request, "resolve">) => Promise<DestructiveChoice>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [req, setReq] = useState<Request | null>(null);

  const confirm = useCallback(
    (r: Omit<Request, "resolve">) =>
      new Promise<DestructiveChoice>((resolve) => setReq({ ...r, resolve })),
    [],
  );

  const finish = (choice: DestructiveChoice) => {
    req?.resolve(choice);
    setReq(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AlertDialog open={!!req} onOpenChange={(o) => !o && finish(null)}>
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-destructive/10 text-destructive grid place-items-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0 text-start">
                <AlertDialogTitle>{req?.title}</AlertDialogTitle>
                <AlertDialogDescription className="mt-1">
                  {req?.description ?? t("common.cannot_undo")}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          {req?.allowReverse && (
            <div className="rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground text-start">
              {t("common.posted_reverse_hint")}
            </div>
          )}

          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="rounded-xl">{t("common.cancel")}</AlertDialogCancel>
            {req?.allowReverse && (
              <AlertDialogAction
                onClick={() => finish("reverse")}
                className="rounded-xl bg-primary text-primary-foreground gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                {t("common.create_reversal")}
              </AlertDialogAction>
            )}
            {req?.allowArchive !== false && (
              <AlertDialogAction
                onClick={() => finish("archive")}
                className="rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 gap-1.5"
              >
                <Archive className="w-4 h-4" />
                {t("common.archive")}
              </AlertDialogAction>
            )}
            <AlertDialogAction
              onClick={() => finish("delete")}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
