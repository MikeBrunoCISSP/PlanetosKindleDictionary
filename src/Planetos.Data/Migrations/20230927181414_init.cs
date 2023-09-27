using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

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
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    name = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    dateCreated = table.Column<DateTime>(type: "datetime2", nullable: false),
                    lastUpdated = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_indices", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "wordDefinitions",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    name = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    definition = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    indexId = table.Column<int>(type: "int", nullable: false),
                    isApproved = table.Column<bool>(type: "bit", nullable: false),
                    dateCreated = table.Column<DateTime>(type: "datetime2", nullable: false),
                    lastUpdated = table.Column<DateTime>(type: "datetime2", nullable: false),
                    KindleIndexid = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_wordDefinitions", x => x.id);
                    table.ForeignKey(
                        name: "FK_wordDefinitions_indices_KindleIndexid",
                        column: x => x.KindleIndexid,
                        principalTable: "indices",
                        principalColumn: "id");
                });

            migrationBuilder.CreateTable(
                name: "inflectionGroups",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    dateCreated = table.Column<DateTime>(type: "datetime2", nullable: false),
                    lastUpdated = table.Column<DateTime>(type: "datetime2", nullable: false),
                    WordDefinitionid = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inflectionGroups", x => x.id);
                    table.ForeignKey(
                        name: "FK_inflectionGroups_wordDefinitions_WordDefinitionid",
                        column: x => x.WordDefinitionid,
                        principalTable: "wordDefinitions",
                        principalColumn: "id");
                });

            migrationBuilder.CreateTable(
                name: "inflections",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    value = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    isExactMatch = table.Column<bool>(type: "bit", nullable: false),
                    inflectionGroupId = table.Column<int>(type: "int", nullable: false),
                    dateCreated = table.Column<DateTime>(type: "datetime2", nullable: false),
                    lastUpdated = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inflections", x => x.id);
                    table.ForeignKey(
                        name: "FK_inflections_inflectionGroups_inflectionGroupId",
                        column: x => x.inflectionGroupId,
                        principalTable: "inflectionGroups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_indices_name",
                table: "indices",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_inflectionGroups_WordDefinitionid",
                table: "inflectionGroups",
                column: "WordDefinitionid");

            migrationBuilder.CreateIndex(
                name: "IX_inflections_inflectionGroupId",
                table: "inflections",
                column: "inflectionGroupId");

            migrationBuilder.CreateIndex(
                name: "IX_wordDefinitions_KindleIndexid",
                table: "wordDefinitions",
                column: "KindleIndexid");

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
                name: "inflectionGroups");

            migrationBuilder.DropTable(
                name: "wordDefinitions");

            migrationBuilder.DropTable(
                name: "indices");
        }
    }
}
