# Azure: an Event Grid subscription joins its source and its endpoint; a
# role assignment is a grant; app settings point an app at another part.

resource "azurerm_storage_account" "uploads" {
  resource_group_name = azurerm_resource_group.shop.name
}

resource "azurerm_eventgrid_event_subscription" "uploads" {
  scope = azurerm_storage_account.uploads.id
  storage_queue_endpoint {
    storage_account_id = azurerm_storage_account.uploads.id
    queue_name         = azurerm_storage_queue.uploads.name
  }
}

resource "azurerm_linux_function_app" "thumbnails" {
  service_plan_id = azurerm_service_plan.shop.id
  app_settings = {
    QUEUE = azurerm_storage_queue.uploads.name
  }
}

resource "azurerm_role_assignment" "reader" {
  scope        = azurerm_storage_account.uploads.id
  principal_id = azurerm_linux_function_app.thumbnails.identity[0].principal_id
}
