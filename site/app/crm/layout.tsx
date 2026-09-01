import { CrmDataModeBar } from '@/app/components/crm-data-mode-bar';

export default function CrmLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <><CrmDataModeBar />{children}</>;
}
