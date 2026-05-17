resource "aws_ecs_cluster" "main" {
  name = var.app_name
}

resource "aws_cloudwatch_log_group" "orbital" {
  name              = "/ecs/${var.app_name}-orbital"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "orbital" {
  family                   = "${var.app_name}-orbital"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_exec.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "orbital"
    image     = "${aws_ecr_repository.orbital.repository_url}:latest"
    essential = true
    portMappings = [{ containerPort = 8000, protocol = "tcp" }]
    environment = [
      { name = "CATALOG_BUCKET", value = "${var.app_name}-catalog" }
    ]
    secrets = [
      { name = "SPACETRACK_USER", valueFrom = aws_secretsmanager_secret.app["SPACE_TRACK_USER"].arn },
      { name = "SPACETRACK_PASS", valueFrom = aws_secretsmanager_secret.app["SPACE_TRACK_PASS"].arn },
      { name = "SENTRY_DSN",      valueFrom = aws_secretsmanager_secret.app["SENTRY_DSN"].arn },
      { name = "DATABASE_URL",    valueFrom = aws_secretsmanager_secret.app["DATABASE_URL"].arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.orbital.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "orbital"
      }
    }
  }])
}

resource "aws_ecs_service" "orbital" {
  name            = "${var.app_name}-orbital"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.orbital.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.orbital.arn
    container_name   = "orbital"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.http]
}
