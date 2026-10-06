# Google Cloud: a function's event trigger, a push subscription and an
# Eventarc trigger are calls; an IAM member is a grant.

resource "google_pubsub_topic" "orders" {}

resource "google_service_account" "worker" {}

resource "google_cloudfunctions2_function" "worker" {
  service_config {
    service_account_email = google_service_account.worker.email
    environment_variables = { ORDERS = google_pubsub_topic.orders.id }
  }
  event_trigger {
    pubsub_topic = google_pubsub_topic.orders.id
  }
}

resource "google_pubsub_subscription" "push" {
  topic = google_pubsub_topic.orders.id
  push_config {
    push_endpoint = google_cloud_run_v2_service.api.uri
  }
}

resource "google_eventarc_trigger" "orders" {
  location = google_cloud_run_v2_service.api.location
  transport {
    pubsub {
      topic = google_pubsub_topic.orders.id
    }
  }
  destination {
    cloud_run_service {
      service = google_cloud_run_v2_service.api.name
    }
  }
}

resource "google_pubsub_topic_iam_member" "publisher" {
  topic  = google_pubsub_topic.orders.name
  member = "serviceAccount:${google_service_account.worker.email}"
}
