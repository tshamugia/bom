import { BackLink, type BackTarget } from "./back-link";

export function PageHead({
  title,
  subtitle,
  actions,
  back,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Detail pages: the list or parent page they belong to ("← Drawings"). */
  back?: BackTarget;
}) {
  return (
    <>
      {back && <BackLink {...back} />}
      <div className="page-head">
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-sub">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </>
  );
}
