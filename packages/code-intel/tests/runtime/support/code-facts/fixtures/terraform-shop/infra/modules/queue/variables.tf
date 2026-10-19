variable "name" {
  type = string
}

variable "dead_letter" {
  type = string
}

variable "topics" {
  type    = list(object({ arn = string }))
  default = []
}

variable "dimensions" {
  type    = map(string)
  default = {}
}
