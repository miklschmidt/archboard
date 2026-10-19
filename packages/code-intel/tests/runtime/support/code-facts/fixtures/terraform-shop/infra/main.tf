terraform {
  required_version = ">= 1.6"
}

provider "aws" {
  region = var.region
}

locals {
  name = "shop-${var.environment}"
  tags = { Service = local.name }
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "api" {
  name               = "${local.name}-api"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_lambda_function" "api" {
  function_name = local.name
  role          = aws_iam_role.api.arn
  # aws_s3_bucket.logs stands only in this comment
  environment {
    variables = {
      QUEUE_URL = module.queue.url
    }
  }
  vpc_config {
    subnet_ids = module.network.private_subnets
  }
  tags = local.tags

  lifecycle {
    ignore_changes = [tags.Owner]
  }
}

module "queue" {
  source      = "./modules/queue"
  name        = local.name
  dead_letter = aws_sqs_queue.dead.arn
  depends_on  = [aws_iam_role.api]
}

module "network" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"
  name    = local.name
}

resource "aws_sqs_queue" "dead" {
  name = "${local.name}-dead"
}

moved {
  from = aws_sqs_queue.old
  to   = aws_sqs_queue.dead
}
