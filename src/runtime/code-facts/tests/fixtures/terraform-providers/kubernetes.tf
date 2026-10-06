# Kubernetes: a route to a Service is a call, a selector and an environment
# value are configured paths, a network policy is a permission, and a release's
# values point it at another part.

resource "kubernetes_namespace" "shop" {}

resource "kubernetes_deployment_v1" "api" {
  metadata {
    namespace = kubernetes_namespace.shop.metadata[0].name
  }
  spec {
    template {
      spec {
        container {
          env {
            name  = "DB_HOST"
            value = kubernetes_service_v1.db.metadata[0].name
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "api" {
  spec {
    selector = kubernetes_deployment_v1.api.spec[0].template[0].metadata[0].labels
  }
}

resource "kubernetes_ingress_v1" "web" {
  spec {
    rule {
      http {
        path {
          backend {
            service {
              name = kubernetes_service_v1.api.metadata[0].name
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_network_policy_v1" "api" {
  spec {
    pod_selector {
      match_labels = kubernetes_deployment_v1.api.metadata[0].labels
    }
  }
}

resource "helm_release" "cache" {
  namespace = kubernetes_namespace.shop.metadata[0].name
  set {
    name  = "upstream"
    value = kubernetes_service_v1.api.metadata[0].name
  }
}

resource "random_password" "db" {
  keepers = { namespace = kubernetes_namespace.shop.id }
}
