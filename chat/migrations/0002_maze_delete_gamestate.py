# Generated by Django 5.1 on 2024-12-05 09:05

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Maze",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("maze_data", models.TextField()),
            ],
        ),
        migrations.DeleteModel(
            name="GameState",
        ),
    ]
