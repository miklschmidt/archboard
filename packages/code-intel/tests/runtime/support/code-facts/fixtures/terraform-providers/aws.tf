# AWS: an event source mapping joins a queue and a function; a listener joins
# a load balancer and a target group; grants are permissions; the rest is
# provisioning.

resource "aws_sqs_queue" "jobs" {
  redrive_policy = jsonencode({ deadLetterTargetArn = aws_sqs_queue.dead.arn })
}

resource "aws_sqs_queue" "dead" {}

resource "aws_cloudwatch_log_group" "worker" {}

resource "aws_iam_role" "worker" {
  assume_role_policy = data.aws_iam_policy_document.read.json
}

data "aws_iam_policy_document" "read" {
  statement {
    resources = [aws_sqs_queue.jobs.arn]
  }
}

resource "aws_iam_role_policy_attachment" "worker" {
  role       = aws_iam_role.worker.name
  policy_arn = aws_iam_policy.read.arn
}

resource "aws_lambda_function" "worker" {
  role = aws_iam_role.worker.arn
  environment {
    variables = { DEAD_LETTERS = aws_sqs_queue.dead.url }
  }
  depends_on = [aws_cloudwatch_log_group.worker]
}

resource "aws_lambda_event_source_mapping" "jobs" {
  event_source_arn = aws_sqs_queue.jobs.arn
  function_name    = aws_lambda_function.worker.arn
}

resource "aws_lb_listener" "web" {
  load_balancer_arn = aws_lb.web.arn
  default_action {
    target_group_arn = aws_lb_target_group.web.arn
  }
}

resource "aws_security_group" "web" {
  dynamic "ingress" {
    for_each = var.ports
    content {
      security_groups = [aws_security_group.lb.id]
    }
  }
}
