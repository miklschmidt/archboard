resource "aws_sqs_queue" "this" {
  name = var.name
  redrive_policy = jsonencode({
    deadLetterTargetArn = var.dead_letter
  })
}

resource "aws_cloudwatch_metric_alarm" "depth" {
  alarm_name    = "${aws_sqs_queue.this.name}-depth"
  alarm_actions = [for topic in var.topics : topic.arn]

  dynamic "dimension" {
    for_each = var.dimensions
    content {
      name  = dimension.key
      value = dimension.value
    }
  }
}
