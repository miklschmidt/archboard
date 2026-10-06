namespace Shop.Core;

public partial class Ledger
{
    internal void Audit(Order order)
    {
        Console.WriteLine(Environment.GetEnvironmentVariable("SHOP_AUDIT"));
    }
}
