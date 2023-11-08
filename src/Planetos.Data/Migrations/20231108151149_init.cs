using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Planetos.Data.Migrations
{
    /// <inheritdoc />
    public partial class init : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "indices",
                columns: table => new
                {
                    kindleIndexId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    name = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    dateCreated = table.Column<DateTime>(type: "datetime2", nullable: false),
                    lastUpdated = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_indices", x => x.kindleIndexId);
                });

            migrationBuilder.CreateTable(
                name: "wordDefinitions",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    name = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    definition = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    kindleIndexId = table.Column<int>(type: "int", nullable: false),
                    isApproved = table.Column<bool>(type: "bit", nullable: false),
                    dateCreated = table.Column<DateTime>(type: "datetime2", nullable: false),
                    lastUpdated = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_wordDefinitions", x => x.id);
                    table.ForeignKey(
                        name: "FK_wordDefinitions_indices_kindleIndexId",
                        column: x => x.kindleIndexId,
                        principalTable: "indices",
                        principalColumn: "kindleIndexId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "inflections",
                columns: table => new
                {
                    inflectionId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    value = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    isExactMatch = table.Column<bool>(type: "bit", nullable: false),
                    wordDefinitionId = table.Column<int>(type: "int", nullable: false),
                    dateCreated = table.Column<DateTime>(type: "datetime2", nullable: false),
                    lastUpdated = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inflections", x => x.inflectionId);
                    table.ForeignKey(
                        name: "FK_inflections_wordDefinitions_wordDefinitionId",
                        column: x => x.wordDefinitionId,
                        principalTable: "wordDefinitions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "indices",
                columns: new[] { "kindleIndexId", "dateCreated", "lastUpdated", "name" },
                values: new object[,]
                {
                    { 1, new DateTime(2023, 11, 8, 15, 11, 48, 961, DateTimeKind.Utc).AddTicks(9393), new DateTime(2023, 11, 8, 15, 11, 48, 961, DateTimeKind.Utc).AddTicks(9393), "Characters" },
                    { 2, new DateTime(2023, 11, 8, 15, 11, 48, 961, DateTimeKind.Utc).AddTicks(9396), new DateTime(2023, 11, 8, 15, 11, 48, 961, DateTimeKind.Utc).AddTicks(9397), "Locations" },
                    { 3, new DateTime(2023, 11, 8, 15, 11, 48, 961, DateTimeKind.Utc).AddTicks(9400), new DateTime(2023, 11, 8, 15, 11, 48, 961, DateTimeKind.Utc).AddTicks(9400), "Houses" },
                    { 4, new DateTime(2023, 11, 8, 15, 11, 48, 961, DateTimeKind.Utc).AddTicks(9403), new DateTime(2023, 11, 8, 15, 11, 48, 961, DateTimeKind.Utc).AddTicks(9403), "Terms" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_indices_name",
                table: "indices",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_inflections_wordDefinitionId",
                table: "inflections",
                column: "wordDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_wordDefinitions_kindleIndexId",
                table: "wordDefinitions",
                column: "kindleIndexId");

            migrationBuilder.CreateIndex(
                name: "IX_wordDefinitions_name",
                table: "wordDefinitions",
                column: "name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "inflections");

            migrationBuilder.DropTable(
                name: "wordDefinitions");

            migrationBuilder.DropTable(
                name: "indices");
        }
    }
}
