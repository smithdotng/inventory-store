import { requireSeller } from '@/lib/server/auth';
import { activeClusters } from '@/lib/server/auth-actions';
import { BUSINESS_CATEGORIES } from '@/lib/server/categories';
import { PageHeader } from '@/components/dashboard/ui';
import { SettingsForm, PasswordForm } from '@/components/dashboard/SettingsForms';

export const metadata = { title: 'Store settings' };

export default async function SettingsPage() {
  const ctx = await requireSeller({ allowLocked: true, anyRole: true });
  const canEdit = ['admin', 'superadmin'].includes(ctx.role);
  const a = ctx.admin;
  const clusters = canEdit ? await activeClusters() : [];
  const acct = (p: 'primary' | 'secondary') => {
    const o = a[`${p}Account`] || {};
    return { bankName: o.bankName || a[`${p}BankName`] || '', bankAccountName: o.bankAccountName || a[`${p}BankAccountName`] || '', accountNumber: o.accountNumber || a[`${p}AccountNumber`] || '' };
  };
  return (
    <>
      <PageHeader title={canEdit ? 'Store settings' : 'Your account'} subtitle={canEdit ? 'Your business details, online store and payment information.' : 'Change your password.'} />
      <div className="space-y-6">
        {canEdit && (
          <SettingsForm
            categories={BUSINESS_CATEGORIES}
            clusters={clusters}
            values={{
              firstName: a.firstName || '', lastName: a.lastName || '', businessName: a.businessName || '', description: a.description || '',
              currency: a.currency || '₦', country: a.country || 'NG', phone: a.phone || '', email: a.email || '', address: a.address || '',
              facebook: a.facebook || '', instagram: a.instagram || '', twitter: a.twitter || '', website: a.website || '',
              publicPhone: !!a.publicPhone, publicEmail: !!a.publicEmail, publicAddress: !!a.publicAddress,
              applyVat: !!a.applyVat, vatRate: String(a.vatRate ?? 7.5), paymentInstructions: a.paymentInstructions || '',
              category: a.category || '', clusterId: a.clusterId ? String(a.clusterId) : '', logo: a.logo || '', username: a.username,
              verified: !!a.isVerified,
              primary: acct('primary'), secondary: acct('secondary'),
            }}
          />
        )}
        <PasswordForm />
      </div>
    </>
  );
}
