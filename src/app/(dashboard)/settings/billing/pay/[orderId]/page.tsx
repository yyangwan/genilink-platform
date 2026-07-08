import PaymentSession from '@/components/billing/payment-session';

export default async function BillingPayPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return (
    <div className="py-8">
      <div className="mx-auto mb-6 max-w-xl text-center">
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)',
          }}
        >
          完成支付
        </h1>
        <p
          className="mt-2 text-sm"
          style={{
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
          }}
        >
          订单已创建，选择支付方式完成订阅开通。
        </p>
      </div>

      <PaymentSession orderId={orderId} />
    </div>
  );
}
