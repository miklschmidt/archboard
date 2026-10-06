namespace Shop.Core;

public partial class Ledger
{
    internal void Audit(Order order)
    {
#if NET8_0_OR_GREATER
        if (order.Total > 0)
#else
        if (order.Total >= 0)
#endif
        {
            Console.WriteLine(Environment.GetEnvironmentVariable("SHOP_AUDIT"));
        }
    }
}
