using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Deck.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AutomationButtonBinding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ButtonId",
                table: "Automations",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Automations_ButtonId",
                table: "Automations",
                column: "ButtonId");

            migrationBuilder.AddForeignKey(
                name: "FK_Automations_Buttons_ButtonId",
                table: "Automations",
                column: "ButtonId",
                principalTable: "Buttons",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Automations_Buttons_ButtonId",
                table: "Automations");

            migrationBuilder.DropIndex(
                name: "IX_Automations_ButtonId",
                table: "Automations");

            migrationBuilder.DropColumn(
                name: "ButtonId",
                table: "Automations");
        }
    }
}
