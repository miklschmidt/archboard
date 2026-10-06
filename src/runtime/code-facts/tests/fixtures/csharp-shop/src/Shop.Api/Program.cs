var controller = new Shop.Api.Controllers.OrdersController(Ledger.Create());
controller.Place(new Order(1m));
