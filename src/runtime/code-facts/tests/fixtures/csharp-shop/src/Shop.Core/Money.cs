namespace Shop.Core;

internal static class Money
{
    public static decimal Round(decimal amount) => amount;
}

public interface ILedger
{
    void Post(Order order);
}

public abstract class LedgerBase { }

public record Order(decimal Total);
