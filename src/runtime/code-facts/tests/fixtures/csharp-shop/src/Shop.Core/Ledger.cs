using System;

namespace Shop.Core
{
    /// <summary>A ledger names PostInComment only in a comment.</summary>
    public partial class Ledger : LedgerBase, ILedger
    {
        private readonly int _rate;

        public static Ledger Create() => new Ledger();

        public void Post(Order order)
        {
            // PostInComment
            var text = "PostInString";
            Audit(order);
            Money.Round(order.Total);
        }

        protected int Rate { get; set; }

        internal enum State { Open, Closed }

        class Hidden { }
    }
}
