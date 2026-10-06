using L = Shop.Core.Ledger;

namespace Shop.Api.Controllers;

public class OrdersController
{
    private readonly ILedger _ledger;

    public OrdersController(ILedger ledger)
    {
        _ledger = ledger;
    }

    public void Place(Order order)
    {
        Ledger.Create();
        _ledger.Post(order);
        L.Create();
        Money.Round(order.Total);
        Track(Ledger);
        Pick()?.Post(order);
    }
}
